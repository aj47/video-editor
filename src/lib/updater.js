import request from "request";

const API_URL = "https://api.github.com/repos/kyushun/gifizer/releases/latest";

const fetchLatestVersion = () =>
  new Promise((resolve, reject) => {
    request(
      {
        url: API_URL,
        method: "GET",
        headers: {
          "User-Agent": require("../../package.json").name
        }
      },
      (error, response, body) => {
        if (error) {
          reject(new Error(error));
        } else if (response.statusCode != 200) {
          reject(
            new Error(
              `${response.statusCode} ${response.statusMessage}: ${body}`
            )
          );
        } else {
          resolve(JSON.parse(response.body));
        }
      }
    );
  });

const versionCompare = (v1, v2, options) => {
  var lexicographical = options && options.lexicographical,
    zeroExtend = options && options.zeroExtend,
    v1parts = v1.split("."),
    v2parts = v2.split(".");

  function isValidPart(x) {
    return (lexicographical ? /^\d+[A-Za-z]*$/ : /^\d+$/).test(x);
  }

  if (!v1parts.every(isValidPart) || !v2parts.every(isValidPart)) {
    return NaN;
  }

  if (zeroExtend) {
    while (v1parts.length < v2parts.length) v1parts.push("0");
    while (v2parts.length < v1parts.length) v2parts.push("0");
  }

  if (!lexicographical) {
    v1parts = v1parts.map(Number);
    v2parts = v2parts.map(Number);
  }

  for (var i = 0; i < v1parts.length; ++i) {
    if (v2parts.length == i) {
      return 1;
    }

    if (v1parts[i] == v2parts[i]) {
      continue;
    } else if (v1parts[i] > v2parts[i]) {
      return 1;
    } else {
      return -1;
    }
  }

  if (v1parts.length != v2parts.length) {
    return -1;
  }

  return 0;
};

export const checkUpdate = async () => {
  let release = await fetchLatestVersion();

  if (release && release.tag_name) {
    const match = release.tag_name.match(/^v(\d+.\d+.\d+)$/);
    if (match && match[1]) {
      const currentVersion = require("../../package.json").version;
      const vc = versionCompare(currentVersion, match[1]);
      if (vc < 0) {
        return release.html_url;
      }
    }
  }

  return false;
};
