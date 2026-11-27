// Contenu statique de index.html (lu par les robots des moteurs de recherche
// et des assistants IA, qui n'exécutent pas JavaScript).
//
// Pour un visiteur humain, React remplace ce contenu dès qu'il monte. On ne le
// montre donc que là où il correspond à ce que React va afficher : la page
// publique pour laquelle ce HTML a été produit (attribut data-static de <html>,
// « / » pour index.html, « /logiciel-devis-electricien » pour la page
// pré-rendue du même nom), chez un visiteur non connecté. Ailleurs (/app/…,
// /login, PWA ouverte par un artisan connecté), on le masque pour éviter un
// éclair de page d'accueil avant l'affichage réel.
//
// Script classique chargé en tête, avant le <body> : la classe est posée avant
// que le contenu ne soit dessiné.
(function () {
  var expected = document.documentElement.getAttribute('data-static') || '/';
  var path = location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/index.html') path = '/';
  var home = path === expected;
  var connected = false;
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.indexOf('sb-') === 0 && key.indexOf('-auth-token') > 0) {
        connected = true;
        break;
      }
    }
  } catch {
    // Stockage indisponible (navigation privée stricte) : on garde l'affichage.
  }
  if (!home || connected) document.documentElement.classList.add('af-app');
})();
