var fs = require('fs');
var path = require('path');
var EventEmitter = require('events');
var gitlost = require('./graph');

class GitEmitter extends EventEmitter {}

var git_emitters = {};
var git_watchers = {};
var heartbeat_timers = {};

function add_emitter(repo) {
  if (git_emitters[repo] === undefined) {
    var gitEmitter = new GitEmitter();
    git_emitters[repo] = gitEmitter;
    gitEmitter.on('error', function (err) {
      console.log('gitEmitter: ' + err);
    });
    heartbeat_timers[repo] = setInterval(function () {
      gitEmitter.emit('git', 'heartbeat');
    }, 55000);
  }
  return git_emitters[repo];
}

function add_watcher(repo) {
  if (!repo) {
    return;
  }
  if (git_watchers[repo] !== undefined) {
    return;
  }

  var git_path = path.join(repo, '.git');
  fs.readFile(git_path, { encoding: 'utf8' }, function (err, data) {
    if (!err && data && data.indexOf('gitdir:') === 0) {
      git_path = path.join(repo, data.substring(8).trim());
    }

    try {
      var gitEmitter = add_emitter(repo);
      var git_logs_watcher = fs.watch(path.join(git_path, 'logs'), { recursive: true }, function (eventType, filename) {
        if (filename) {
          console.log(eventType, filename);
          gitEmitter.emit('git', eventType, filename);
        }
      });
      var git_refs_watcher = fs.watch(path.join(git_path, 'refs'), { recursive: true }, function (eventType, filename) {
        if (filename) {
          console.log(eventType, filename);
          gitEmitter.emit('git', eventType, filename);
        }
      });
      git_watchers[repo] = [git_logs_watcher, git_refs_watcher];
      console.log('watching: ' + repo);
    } catch (watchErr) {
      console.log(watchErr);
    }
  });
}

function parse_show_target(url) {
  var match = /^\/show\/([^;<>&|\\\*\[\?\s]+)$/.exec(url || '');
  return match ? match[1] : null;
}

function get_repo(headers) {
  if (!headers) {
    return null;
  }
  return headers['gitlost-repo'] || headers['Gitlost-Repo'] || headers['GitLost-Repo'] || null;
}

function get_settings(headers) {
  var raw = headers && (headers['gitlost-settings'] || headers['Gitlost-Settings'] || headers['GitLost-Settings']);
  if (!raw) {
    return { rankdir: 'LR' };
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    return { rankdir: 'LR' };
  }
}

function get_status(headers) {
  var repo = get_repo(headers);
  add_watcher(repo);
  return gitlost.queue_cmd(repo, 'git status');
}

function get_dot(headers) {
  var repo = get_repo(headers);
  var settings = get_settings(headers);
  console.log(settings);
  return gitlost.graph(repo, settings);
}

function get_tags(headers) {
  var repo = get_repo(headers);
  return gitlost.queue_cmd(repo, 'git for-each-ref refs/tags/* --format="%(refname) %(*objectname)"')
    .then(function (output) {
      return output.split(/\n/).filter(function (tag) {
        return tag !== '';
      }).map(function (tag) {
        var parts = tag.split(' ');
        return {
          refname: parts[0].substring(11),
          objectname: parts[1]
        };
      });
    });
}

function get_branches(headers) {
  var repo = get_repo(headers);
  return gitlost.queue_cmd(repo, 'git for-each-ref --format="%(refname) %(objectname)"')
    .then(function (output) {
      return output.split(/\n/).filter(function (tag) {
        return tag !== '';
      }).map(function (tag) {
        var parts = tag.split(' ');
        return {
          refname: parts[0].substring(parts[0].indexOf('/', 6) + 1),
          objectname: parts[1]
        };
      });
    });
}

function get_show(url, headers) {
  var target = parse_show_target(url);
  if (!target) {
    return Promise.reject(new Error('Invalid show target'));
  }
  var repo = get_repo(headers);
  return gitlost.queue_cmd(repo, 'git show --stat=300 --format=fuller ' + target)
    .then(function (output) {
      return {
        id: target,
        text: output
      };
    });
}

function get_refs(headers) {
  var repo = get_repo(headers);
  return gitlost.queue_cmd(repo, 'git for-each-ref --format="%(objectname) %(refname) %(refname:short)"')
    .then(function (refs) {
      return {
        repo_path: repo,
        refs: refs.split('\n').filter(function (ref) {
          return ref !== '';
        }).map(function (ref) {
          var ref_info = ref.split(' ');
          return {
            commit: ref_info[0],
            ref_name: ref_info[1],
            ref_short: ref_info[2]
          };
        })
      };
    });
}

function get_watch(headers) {
  var repo = get_repo(headers);
  if (!git_emitters[repo]) {
    return Promise.reject(new Error('No emitter for ' + repo));
  }
  return new Promise(function (resolve) {
    git_emitters[repo].once('git', function (eventType, filename) {
      if (eventType === 'close') {
        resolve({ close: true });
      } else if (eventType === 'heartbeat') {
        resolve({ heartbeat: true });
      } else {
        gitlost.invalidate_cmd_memo(repo);
        resolve({ filename: (filename || '') });
      }
    });
  });
}

function get_log() {
  return Promise.resolve(gitlost.get_git_log());
}

function close_all() {
  Object.keys(git_emitters).forEach(function (repo) {
    git_emitters[repo].emit('git', 'close');
  });

  Object.keys(git_watchers).forEach(function (repo) {
    git_watchers[repo].forEach(function (watcher) {
      try {
        watcher.close();
      } catch (err) {
        console.log(err);
      }
    });
  });

  Object.keys(heartbeat_timers).forEach(function (repo) {
    clearInterval(heartbeat_timers[repo]);
  });

  git_watchers = {};
  git_emitters = {};
  heartbeat_timers = {};
}

function handle_get(url, headers) {
  if (url === '/git/status') return get_status(headers);
  if (url === '/dot') return get_dot(headers);
  if (url === '/git/tags') return get_tags(headers);
  if (url === '/git/branches') return get_branches(headers);
  if (url === '/refs') return get_refs(headers);
  if (url === '/watch') return get_watch(headers);
  if (/^\/show\//.test(url || '')) return get_show(url, headers);
  return Promise.reject(new Error('Unknown GET endpoint: ' + url));
}

function handle_put(url) {
  if (url === '/close') {
    close_all();
    return Promise.resolve({ close: true });
  }
  return Promise.reject(new Error('Unknown PUT endpoint: ' + url));
}

module.exports = {
  handle_get: handle_get,
  handle_put: handle_put,
  get_log: get_log,
  close_all: close_all
};
