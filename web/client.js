$(function () {
    settings = {};
    // Configure UI
    $( "button[name=rankdir]")
        .click(function () {
            settings.set('rankdir', $(this).val());
            get_graph();
        });
    $("button[name=include_forward")
        .click(function () {
            settings.set('include_forward', !$(this).hasClass('active'));
            get_graph();
        })
    // Load saved settings
    function Settings(repo_path) {
        this.repo_path = repo_path;
        this.settings = JSON.parse(localStorage.getItem(this.repo_path) || '{}');
        if (settings.include_forward === undefined) settings.include_forward = false;
    }
    Settings.prototype.set = function(key, value) {
        this.settings[key] = value;
        localStorage.setItem(this.repo_path, JSON.stringify(this.settings));
    }
    // API functions
    function update_graph(dot) {
        var svg = Viz(dot, {
            format: 'svg',
            engine: 'dot'
        });
        $("#svg_div")
        .html(svg)
        .find('a')
        .each(function () {
            var that = $(this);
            that.data('href', that.attr('xlink:href'));
            that.removeAttr('xlink:href');
            that.css('cursor', 'pointer');
        })
        .click(function (event) {
            var that = $(this);
            $.ajax({
                type: "GET",
                url: that.data('href')
            })
            .done(function (output) {
                BootstrapDialog.show({
                    title: that.data('href').slice(5),
                    message: '<pre>' + output + '</pre>'
                });
            })
        });
    }
    $("#close").click(function (event) {
        event.preventDefault();
        $.ajax({
            type: "PUT",
            url: "/close"
        })
        .done(function (response) {
            window.close();
        });
    });
    var refs_select;    
    var refs_sortable;
    $('select[name=refs]')
        .selectpicker({actionsBox: true})
        .on('hide.bs.select', function () {
            var selected = refs_select.val();
            settings.set('branches', refs_sortable.toArray().filter(function (item) {
                return selected.indexOf(item) >= 0;
            }));
            // update after select close
            setTimeout(get_graph(),1);
        });
    function update_refs(refs) {
        var refs_selected = settings.settings.branches || [];
        refs_select = $('select[name=refs]');
        refs_select.find('option').remove();
        refs_selected.forEach(function (ref_short) {
            if (refs.some(function (ref) {
                return ref.ref_short === ref_short;
            })) {
                refs_select.append($('<option>' + ref_short + '</option>'));
            }
        })
        refs.forEach(function (ref) {
            if (refs_selected.indexOf(ref.ref_short) === -1) {
                refs_select.append($('<option>' + ref.ref_short + '</option>'));
            }
        });
        refs_select.selectpicker('refresh');
        var refs_ul = $('ul[role=listbox]');
        refs_ul.find('li').each(function (idx, item) {
            $(item).attr('data-id', $(item).find('span.text').text());
        })
        if (refs_sortable) refs_sortable.destroy();
        refs_sortable = Sortable.create(refs_ul.get(0), {
            store: {
                get: function (sortable) {
                    var sorted = refs_selected.slice(0);
                    refs.forEach(function (ref) {
                        if (sorted.indexOf(ref.ref_short) === -1) {
                            sorted.push(ref.ref_short);
                        }
                    });
                    return sorted;
                },
                set: function (sortable) {
                    var selected = refs_select.val();
                    settings.set('branches', sortable.toArray().filter(function (item) {
                        return selected.indexOf(item) >= 0;
                    }));
                }
            }
        })
        refs_select.selectpicker('val', refs_selected);
    }
    /*
     * Prevent multiple ajax requests from firing
     * Allow at most one request to queue up due to changed data
     * Fire off next request with current data
     * Shut off polling when requesting graph update
     */
    var graph_queued = false;
    var graph_promise = null;
    var polling = null;
    function get_graph() {
        if (polling !== null) {
            //polling.abort();
        }
        if (graph_promise === null) {
            // Inital request
            graph_promise = $.ajax({
                type: 'GET',
                url: '/refs',
                contentType: 'application/json'
            })
            .then(function (repo) {
                settings = new Settings(repo.repo_path);
                if (settings.settings.rankdir) {
                    $('button[name=rankdir][value=' + settings.settings.rankdir + ']').button('toggle');
                }
                if (settings.settings.include_forward) {
                    $('button[name=include_forward]').addClass('active').attr('aria-pressed', 'true');
                }
                $('span.navbar-brand').text(repo.repo_path);
                update_refs(repo.refs);
                return $.ajax({
                    type: "GET",
                    url: "/dot",
                    headers: {'gitlost-settings': JSON.stringify(settings.settings)},
                    contentType: 'application/json',
                })
            })
            .then(function (dot) {
                update_graph(dot);
                if (graph_queued === false) {
                    graph_promise = null;
                    poll_git();
                }
            })
            .catch(function (err) {
                graph_promise = null;
                console.log(err);
            });
            return graph_promise;
        } else if (graph_queued === false) {
            // Queue one additional request
            graph_queued = true;
            graph_promise = graph_promise.then(function () {
                graph_queued = false;
                graph_promise = null;
                graph_promise = get_graph();
                return graph_promise;
            });
        } else {
            // Prevent multiple requests from queueing
            return graph_promise;
        }
    }
    function poll_git() {
        if (polling === null) {
            polling = $.ajax({
                type: "GET",
                url: "/watch"
            })
            .then(function (result) {
                polling = null;
                if (result.close) {
                } else if (result.heartbeat) {
                    setTimeout(poll_git, 1);
                } else {
                    console.log(result);
                    setTimeout(get_graph, 1);
                }
            })
            .catch(function (err) {
                polling = null;
                console.log(err);
            });
        }
    }
    // startup
    get_graph();
});