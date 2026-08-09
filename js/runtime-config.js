(() => {
  const { hostname, protocol } = window.location;

  const isLocalNetwork =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);

  const apiBaseUrl = isLocalNetwork
    ? `${protocol}//${hostname}:3001`
    : "https://api.parkin.com.sa";

  window.PARKIN_CONFIG = Object.freeze({
    apiBaseUrl,
  });
})();
