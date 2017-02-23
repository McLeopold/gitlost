$(function () {
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
            type: "GET",
            url: "/svg"
        })
        .done(function (svg) {
            $("#svg_div").html(svg);
            update_svg();
            poll_git();
        });
    }
    function poll_git() {
        $.ajax({
            type: "GET",
            url: "/watch"
        })
        .done(function (result) {
            if (result.TimedOut !== true) {
                console.log(result);
                get_svg();
            } else {
                poll_git();
            }
        });
    }
    get_svg();
});