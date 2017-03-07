$(function () {
    // Configure UI
    $( "input[name=rankdir]")
        .click(function () {
            set('rankdir', $(this).val());
            get_graph();
        });
    // Load saved settings
    var settings = JSON.parse(localStorage.getItem('settings')) || {};
    if (settings.rankdir) {
        $("input[name=rankdir][value=" + settings.rankdir + "]")
            .prop('checked', true);
    }
    function set(key, value) {
        settings[key] = value;
        localStorage.setItem('settings', JSON.stringify(settings));
    }
    // API functions
    function update_graph(dot) {
        var svg = Viz(dot, {
            format: 'svg',
            engine: 'dot'
        });
        $("#svg_div").html(svg);
        $('a')
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
                $('#show').html('<pre>' + output + '</pre>');
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
    $('select[name=refs]')
        .selectpicker({actionsBox: true})
        .on('hide.bs.select', function () {
            set('branches', $('select[name=refs]').val());
        });
    function update_refs(refs) {
        var refs_select = $('select[name=refs]');
        refs_select.find('option').remove();
        refs.forEach(function (ref) {
            refs_select.append($('<option>' + ref.ref_short + '</option>'));
        });
        setTimeout(function () { refs_select.selectpicker('refresh'); }, 1);
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
            polling.abort();
        }
        if (graph_promise === null) {
            // Inital request
            graph_promise = Promise.all([
                $.ajax({
                    type: 'GET',
                    url: '/refs',
                    contentType: 'application/json'
                }),
                $.ajax({
                    type: "GET",
                    url: "/dot",
                    headers: {'gitlost-settings': JSON.stringify(settings)},
                    contentType: 'application/json',
                })
            ])
            .then(function (info) {
                graph_promise = null;
                update_refs(info[0]);
                update_graph(info[1]);
                if (graph_queued === false) {
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
                polling = false;
                if (result.close) {
                } else if (result.heartbeat) {
                    setTimeout(poll_git, 1);
                } else {
                    console.log(result);
                    if (!getting) {
                        setTimeout(get_graph, 1);
                    }
                }
            })
            .catch(function (err) {
                polling = false;
                console.log(err);
            });
        }
    }
    // startup
    get_graph();
});