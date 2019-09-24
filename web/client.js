Vue.component('gitlost-graph', {
  components: { splitpanes },
  props: ['repo'],
  data() {
    return {
      // treeview
      items: [],
      search: null,
      // tab view
      commit_tab: null,
      commits: [],
      // ui elements
      graph: null,
      // ui
      top_items: ['HEAD', 'master', 'tags', ''],
      draw_types: ['dot', 'neato', 'twopi', 'circo', 'fdp', 'sfdp', 'patchwork', 'osage'],
      nav_expand: [0],
      loading: false,
      goto: null,
      commitTabSize: 0.1,
      sidebarSize: 20,
      sidebarLastSize: null,
      // polling
      graph_queued: false,
      graph_promise: null,
      polling: null,
      //
      settings: {
        branches: [],
        opened: [],
        rankdir: 'LR',
        include_forward: false,
        draw_type: 'dot',
      },
    }
  },
  methods: {
    toggleCommitTab: function () {
      if (this.commits.length > 0) {
        var sliderHeight = this.$el.querySelector('.commit_tab').querySelector('.v-tabs-bar').clientHeight;
        var tabHeight = this.$el.querySelector('.commit_tab').clientHeight;
        if (sliderHeight === tabHeight) {
          window.setTimeout(() => this.toggleCommitTab());
        } else {
          var totalHeight = this.$el.querySelector('.graph_bar').clientHeight;
          this.commitTabSize = tabHeight/totalHeight*100;
        }
      } else {
        this.commitTabSize = 0.1;
      }
    },
    toggleCommitResized: function (event) {
      commitTabSize = event[1].width;
      var sliderHeight = this.$el.querySelector('.commit_tab').querySelector('.v-tabs-bar').clientHeight;
      var tabHeight = this.$el.querySelector('.graph_bar').querySelector('#pane_1').clientHeight;
      var textHeight = tabHeight - sliderHeight;
      this.$el.querySelectorAll('.commit_text').forEach(text => {
        text.style.height = textHeight + 'px';
      });
    },
    toggleSidebar: function() {
      if (this.sidebarLastSize === null) {
        this.sidebarLastSize = this.sidebarSize;
        this.sidebarSize = 0.1;
      } else {
        this.sidebarSize = this.sidebarLastSize;
        this.sidebarLastSize = null;
      }
    },
    addCommitTab: function (commit) {
      this.commits.push(commit);
      window.setTimeout(() => {
        this.commit_tab = this.commits.length - 1;
        this.toggleCommitTab();
      });
    },
    removeCommitTab: function (commit_id) {
      this.commits.splice(this.commits.findIndex(commit => commit.id === commit_id), 1);
    },
    selectTree: function (stuff) {
      this.zoom_graph_on(stuff[0].ref_prefixes[0] + stuff[0].id);
      //console.log(stuff);
    },
    remove_branch: function (id) {
      this.settings.branches.splice(this.settings.branches.findIndex(branch => branch.id === id), 1);
    },
    updateGraph: function () {
      this.loading = true;
      //var branches = this.settings.branches.map(branch => branch.ref_prefixes.map(prefix => prefix + branch.id)).flat();
      //console.log(branches);
      //settings.set('branches', branches);
      // update after select close
      setTimeout(() => {
        this.get_graph(this).then(() => this.loading = false);
      }, 1);
    },
    updateRefs: function (refs) {
      var sortedRefs = refs
        .map(function (ref) {
          return ref.ref_name.replace('refs/', '');
        })
        .map(function (ref_name) {
          var parts = ref_name.match(/(tags\/|heads\/|remotes\/(\w+\/))(.+)/)
          return parts
            ? { prefix: parts[2] || '', parts: parts[3].split('/'), name: (parts[2] || '') + parts[3], tag: parts[1] === 'tags/' }
            : { prefix: '', parts: ref_name.split('/'), name: ref_name };
        })
        .sort(function (a, b) {
          if (a.parts[0] === 'master') return b.parts[0] !== 'master' ? -1 : a.parts[0] === '' ? -1 : 1;
          if (b.parts[0] === 'master') return 1;
          if (a.tag && !b.tag) return 1;
          if (b.tag && !a.tag) return -1;
          if (a.parts.length > 1 && b.parts.length === 1) return -1;
          if (a.parts.length === 1 && b.parts.length > 1) return 1;
          return (a.name > b.name) ? 1 : -1;
        });
      //console.log(sortedRefs);
      var newTree = this.items;
      this.top_items.forEach(item => {
        if (!newTree.find(element => element.name === item)) newTree.push({ id: item, name: item });
      })
      sortedRefs.forEach(ref => {
        var treePath = '';
        var treeLoc = newTree;
        if (ref.tag) treeLoc = treeLoc.find(element => element.name === 'tags');
        else if (ref.parts.length === 1 && !this.top_items.includes(ref.parts[0])) treeLoc = newTree.find(element => element.name === '');
        ref.parts.forEach(part => {
          treePath += (treePath !== '' ? '/' : '') + part;
          if (!Array.isArray(treeLoc)) {
            if (!treeLoc.children) treeLoc.children = [];
            treeLoc = treeLoc.children;
          }
          var newTreeLoc = treeLoc.find(element => element.name === part);
          if (!newTreeLoc) {
            newTreeLoc = {
              id: treePath,
              name: part,
            };
            treeLoc.push(newTreeLoc);
          }
          treeLoc = newTreeLoc;
        });
        if (!treeLoc.ref_prefixes) treeLoc.ref_prefixes = [ref.prefix];
        else if (!treeLoc.ref_prefixes.includes(ref.prefix)) treeLoc.ref_prefixes.push(ref.prefix);
      });
      //console.log(newTree);
      //this.settings.branches = settings.settings.branches.map(branch => { return { id: branch }; });
    },
    zoom_graph_on: function (value) {
      // TODO: remove jquery, search item data for key
      this.zoom_graph_to($(this.graph).find("text:contains(" + value + ")"));
    },
    zoom_graph_to: function (target) {
      var gv = d3.select(this.graph).graphviz();
      var svg = $(this.graph).children('svg');
      var viewbox = svg.attr('viewBox').split(' ').map(a => parseFloat(a));
      var g = svg.children('.graph');
      var scale = Math.max(Math.max(viewbox[2], viewbox[3])/1000, parseFloat(g.attr('transform').match(/scale\((.+)\)/)[1]));
      var x = parseFloat($(target).attr('x'));
      var y = parseFloat($(target).attr('y'));
      gv.zoomSelection().transition().duration(750).call(gv.zoomBehavior().transform, d3.zoomIdentity.scale(scale).translate(-x + viewbox[2] / 2 / scale, -y + viewbox[3] / 2 / scale));
    },
    update_graph: function (dot) {
      var t = d3.transition()
        .duration(750)
        .ease(d3.easeLinear);
      d3
        .select(this.graph)
        .graphviz({
          zoomScaleExtent: [0.1, 100],
        })
        .transition(t)
        .renderDot(dot, () => {
          var v = this;
          var $graph = $(this.graph);
          $graph
            .children('svg')
            .height('100%')
            .width('100%');;
          $graph
            .find('a')
            .each(function () {
              var that = $(this);
              that.data('href', that.attr('href'));
              that.removeAttr('href');
              that.css('cursor', 'pointer');
            })
            .click((event) => {
              event.preventDefault();
              var commit_id = $(event.currentTarget).data('href').substring(5);
              axios.get('show/'+commit_id, { headers: { 'gitlost-repo': this.repo } })
              .then(output => {
                this.addCommitTab(output.data);
              })
              //zoom_graph_to(event.target);
              return;
              var that = $(this);
              axios.get(that.data('href'), { headers: { 'gitlost-repo': this.repo } })
                /*
                $.ajax({
                  type: "GET",
                  url: that.data('href')
                })
                */
                .then(function (output) {
                  //output = output.data;
                  //var outputArray = JSON.parse(output);
                  BootstrapDialog.show({
                    title: that.data('href').slice(5),
                    message: '<ul class="nav nav-tabs" id="tabContent"><li class="active"><a href="#details" data-toggle="tab">Details</a></li><li><a href="#status" data-toggle="tab">Status</a></li></ul>'
                      + '<div class="tab-content">'
                      + '<div class="tab-pane active" id="details">'
                      + '<br/><pre>' + output[2] + '</pre>'
                      + '</div>'
                      + '<div class="tab-pane" id="status">'
                      + '<br/><pre>' + output[1] + '</pre>'
                      + '</div>'
                      + '</div>'
                  });
                })
            });
        });
      // add right click menus
      /*
      var menu = new BootstrapMenu(
        'g.node', 
        {
          actions: [
            {
              name: 'Add Refs', 
              onClick: function (objectname) {
                var link_refs = axios.get('/git/branches', { headers: { 'gitlost-repo': this.repo } })
                var link_refs = $.ajax({
                  type: 'GET',
                  url: '/git/branches',
                  contentType: 'application/json'
                })
                .then(function (all_branches) {
                  all_branches = all_branches.data;
                  var refs_select = $('select[name=refs]');
                  var new_branches = refs_select.val().concat(
                    all_branches.filter(function (branch) {
                      return branch.objectname === objectname;
                    }).map(function (branch) {
                      return branch.refname;
                    })
                  );
                  refs_select.val(new_branches);
                  refs_select.selectpicker('refresh');
                  settings.set('branches', new_branches);
                  setTimeout(get_graph,1);
                });
              }
            }
          ], 
          fetchElementData: function ($el) { 
            return $el.find('title').text(); 
          }
        }
      );
      */
    },
    get_graph: function () {
      if (this.polling !== null) {
        //polling.abort();
      }
      if (this.graph_promise === null) {
        // Inital request
        this.graph_promise = axios.get('/refs', { headers: { 'gitlost-repo': this.repo } })
          .then((repo) => {
            repo = repo.data;
            //settings = new Settings(repo.repo_path);
            /*
            if (settings.settings.include_forward) {
              $('button[name=include_forward]').addClass('active').attr('aria-pressed', 'true');
            }
            settings.set('draw_type', $('select[name=graphTypes]').val());
            */
            this.updateRefs(repo.refs);
            var passed_settings = {
              branches: this.settings.branches.map(branch =>
                branch.ref_prefixes.map(prefix => prefix + branch.id)
              ).flat(),
              rankdir: this.settings.rankdir,
              include_forward: this.settings.include_forward,
              draw_type: this.settings.draw_type,
            };
            if (passed_settings.branches.length === 0) passed_settings.branches = ['master'];
            return axios.get('/dot', { headers: {
              'gitlost-repo': this.repo,
              'gitlost-settings': JSON.stringify(passed_settings)
            } });
          })
          .then((dot) => {
            dot = dot.data;
            this.update_graph(dot);
            if (this.graph_queued === false) {
              this.graph_promise = null;
              this.poll_git();
            }
          })
          .catch((err) => {
            this.graph_promise = null;
            console.log(err);
          });
        return this.graph_promise;
      } else if (this.graph_queued === false) {
        // Queue one additional request
        this.graph_queued = true;
        this.graph_promise = this.graph_promise.then(() => {
          this.graph_queued = false;
          this.graph_promise = null;
          this.graph_promise = this.get_graph();
          return this.graph_promise;
        });
      } else {
        // Prevent multiple requests from queueing
        return this.graph_promise;
      }
    },
    poll_git: function () {
      return;
      if (this.polling === null) {
        axios.get('/watch', { headers: { 'gitlost-repo': this.repo } })
          /*
          polling = $.ajax({
            type: "GET",
            url: "/watch"
          })
          */
          .then((result) => {
            result = result.data;
            this.polling = null;
            if (result.close) {
            } else if (result.heartbeat) {
              setTimeout(() => this.poll_git(), 1);
            } else {
              console.log(result);
              setTimeout(() => this.get_graph(), 1);
            }
          })
          .catch((err) => {
            this.polling = null;
            console.log(err);
          });
      }
    }
  },
  mounted: function () {
    axios.get('/refs', { headers: {'gitlost-repo': this.repo } })
    .then(response => {
      this.updateRefs(response.data.refs);
      var settings = JSON.parse(localStorage[this.repo] || '{}');
      for (setting in settings) this.settings[setting] = settings[setting];
  
      this.graph = this.$el.querySelector(".graph");
      this.get_graph(this);
    });
  },
  watch: {
    settings: {
      handler(new_settings) {
        localStorage[this.repo] = JSON.stringify(new_settings);
      },
      deep: true
    }
  }
});

Vue.component('gitlost-commit', {
  props: ['commit'],
  data() {
    return {

    }
  },
  methods: {

  },
  watch: {

  }
});