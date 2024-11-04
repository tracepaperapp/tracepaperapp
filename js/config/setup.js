$vui.config = {
    namespace: 'ui'
}
$vui.config.importMap = {
    "*": '/components/${path}${component}.html'
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js')
    .then(registration => {
      if (registration.installing) {
        console.log('Er wordt een nieuwe Service Worker geïnstalleerd.');
      } else if (registration.waiting) {
        console.log('Er is een nieuwe Service Worker die wacht om actief te worden.');
      } else if (registration.active) {
        console.log('Service Worker is al actief.');
      }
    })
    .catch(error => {
      console.error('Service Worker registratie mislukt:', error);
    });
}
