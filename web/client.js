$(function () {
    // Configure UI
    $( "input[name=rankdir]")
        .checkboxradio({
            icon: false
        })
        .click(function () {
            set('rankdir', $(this).val());
            get_svg();
        });
    $("fieldset[name=rankdir]").controlgroup();
    $('fieldset[name=controls]').controlgroup();
    // Load saved settings
    var settings = JSON.parse(localStorage.getItem('settings')) || {};
    if (settings.rankdir) {
        $("input[name=rankdir][value=" + settings.rankdir + "]")
            .prop('checked', true);
        $("fieldset[name=rankdir]").controlgroup('refresh');
    }
    function set(key, value) {
        settings[key] = value;
        localStorage.setItem('settings', JSON.stringify(settings));
    }
    // API functions
    function update_svg() {
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
                $('<div><pre>' + output + '</pre></div>').dialog({
                    title: that.data('href'),
                    height: 600,
                    width: 800
                });
                //console.log(output);
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
    function get_refs() {
        $.ajax({
            type: 'GET',
            url: '/refs',
            contentType: 'application/json'
        })
        .done(function (refs) {
            var refs_fieldset = $('fieldset[name=refs]');
            refs_fieldset.find('label').remove();
            refs.forEach(function (ref) {
                refs_fieldset.append($('<label for="ref-' + ref.ref_short + '">' + ref.ref_short +
                    '<input type="checkbox" name="refs" id="ref-' + ref.ref_short + '" value="' + ref.ref_short + '" /></label>'))
            });
            refs_fieldset.find('input[type=checkbox]')
                .checkboxradio()
                .click(function () {
                    set('branches', $('input[name=refs]:checked').map(function () { return this.value; }).get());
                    get_svg();
                });
            refs_fieldset.controlgroup({
                "direction": "vertical"
            });
        })
        .fail(function () {
            console.log(arguments);
        })
    }
    var getting = false;
    function get_svg() {
        if (!getting) {
            getting = true;
            $.ajax({
                type: "GET",
                url: "/dot",
                headers: {'gitlost-settings': JSON.stringify(settings)},
                contentType: 'application/json',
            })
            .done(function (dot) {                
                getting = false;
                var svg = Viz(dot, {
                    format: 'svg',
                    engine: 'dot'
                });
                $("#svg_div").html(svg);
                update_svg();
                poll_git();
            })
            .fail(function () {
                getting = false;
                console.log(arguments);
            });
        }
    }
    var polling = false;
    function poll_git() {
        if (!polling) {
            polling = true;
            $.ajax({
                type: "GET",
                url: "/watch"
            })
            .done(function (result) {
                polling = false;
                if (result.close) {
                } else if (result.heartbeat) {
                    setTimeout(poll_git, 1);
                } else {
                    console.log(result);
                    if (!getting) {
                        setTimeout(get_svg, 1);
                    }
                }
            })
            .fail(function () {
                polling = false;
                console.log(arguments);
            });
        }
    }
    get_refs();
    get_svg();
});