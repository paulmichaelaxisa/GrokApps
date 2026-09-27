(function(){
  var n = 9;
  var parts = [];
  function go(){
    var bin = atob(parts.join(""));
    var s = document.createElement("script");
    s.text = bin;
    document.head.appendChild(s);
  }
  var left = n;
  for (var i = 0; i < n; i++) {
    (function(i){
      fetch("bundle." + i + ".b64").then(function(r){ return r.text(); }).then(function(t){
        parts[i] = t.replace(/\s+/g,"");
        if (--left === 0) go();
      }).catch(function(e){
        console.error(e);
        var el = document.getElementById("keyBanner");
        if (el) { el.hidden = false; el.textContent = "Failed to load app bundle."; }
      });
    })(i);
  }
})();
