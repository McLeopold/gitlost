$(function () {
    function poll_git() {
        $.ajax({
            type: "GET",
            url: "/wait"
        })
        .done(function (svg) {
            if (svg !== "") {
                $("#svg_div").html(svg);
            }
            poll_git();
        })
    }
    poll_git();
});