$(function () {
    function get_svg() {
        $.ajax({
            type: "GET",
            url: "/svg"
        })
        .done(function (svg) {
            $("#svg_div").html(svg);
            poll_git();
        })
    }
    function poll_git() {
        $.ajax({
            type: "GET",
            url: "/watch"
        })
        .done(function (result) {
            console.log(result);
            if (result.TimedOut !== true) {
                get_svg();
            } else {
                poll_git();
            }
        })
    }
    get_svg();
});