const CACHE_NAME = 'tractar-v' + '2026072001';
const URLS_TO_CACHE = ['/', '/index.html', '/style.css', '/app.js'];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(URLS_TO_CACHE);
    })
  );
  // Ativar imediatamente sem esperar a aba fechar
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(name) {
          // Deletar qualquer cache antigo que não seja o atual
          return name.startsWith('tractar-') && name !== CACHE_NAME;
        }).map(function(name) {
          console.log('Deletando cache antigo:', name);
          return caches.delete(name);
        })
      );
    }).then(function(){
      // Tomar controle de todas as abas abertas imediatamente
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(event) {
  // Requisições ao Supabase sempre vão direto para a rede
  if(event.request.url.includes('supabase.co') ||
     event.request.url.includes('googleapis.com') ||
     event.request.url.includes('jsdelivr.net') ||
     event.request.url.includes('cdnjs.cloudflare.com')) {
    return;
  }
  // Para os arquivos do app: tenta rede primeiro, cai no cache se offline
  event.respondWith(
    fetch(event.request)
      .then(function(response) {
        // Salvar cópia no cache
        var responseClone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(function() {
        // Se não tiver rede, serve do cache
        return caches.match(event.request);
      })
  );
});
