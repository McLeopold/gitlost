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
    function get_svg() {
        $.ajax({
            type: "POST",
            url: "/svg",
            data: JSON.stringify(settings),
            contentType: 'application/json',
        })
        .done(function (svg) {
            $("#svg_div").html(svg);
            update_svg();
            poll_git();
        })
        .fail(function () {
            console.log(arguments);
        });
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
                if (result.TimedOut !== true) {
                    console.log(result);
                    get_svg();
                } else {
                    setTimeout(poll_git, 1000);
                }
            });
        }
    }
    get_svg();
});