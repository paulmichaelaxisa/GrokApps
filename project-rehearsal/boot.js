(function(){
  var b64 = window.__PR_B64.join("");
  var bin = (typeof atob === "function")
    ? atob(b64)
    : Buffer.from(b64, "base64").toString("utf8");
  var s = document.createElement("script");
  s.text = bin;
  document.head.appendChild(s);
})();
