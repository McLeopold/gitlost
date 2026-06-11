const { contextBridge, ipcRenderer } = require('electron');

function normalizeHeaders(options) {
  return options && options.headers ? options.headers : {};
}

function request(method, url, options) {
  var normalizedUrl = url;
  if (normalizedUrl && normalizedUrl[0] !== '/') {
    normalizedUrl = '/' + normalizedUrl;
  }
  return ipcRenderer.invoke('gitlost:' + method.toLowerCase(), {
    url: normalizedUrl,
    headers: normalizeHeaders(options)
  }).then(function (data) {
    return { data: data };
  });
}

contextBridge.exposeInMainWorld('gitlostApi', {
  selectFolder: function () {
    return ipcRenderer.invoke('gitlost:select-folder');
  }
});

contextBridge.exposeInMainWorld('axios', {
  get: function (url, options) {
    return request('get', url, options);
  },
  put: function (url, options) {
    return request('put', url, options);
  }
});
