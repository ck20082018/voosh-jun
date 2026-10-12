if (new URLSearchParams(location.search).get('demo') === 'classic') {
  import('./classic');
} else {
  import('./bootstrap');
}
