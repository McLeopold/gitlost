import gitlost from '../lib/graph';
settings = JSON.parse(process.argv.slice(2).join(' ') || '{}');
gitlost.graph(settings).then(function (dot) {
    console.log(dot);
})
