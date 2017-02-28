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
            type: "GET",
            url: "/kill"
        })
        .done(function (response) {
            window.close();
        });
    });
    var getting = false;
    function get_svg() {
        if (!getting) {
            getting = true;
            $.ajax({
                type: "GET",
                url: "/dot",
                headers: {'gitviz-settings': JSON.stringify(settings)},
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
                if (result.heartbeat) {
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
    get_svg();
});