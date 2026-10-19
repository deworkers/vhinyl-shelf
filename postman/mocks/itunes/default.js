const http = require('node:http');

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Content-Type', 'application/json');
  if (url.pathname !== '/search') {
    res.writeHead(501);
    return res.end(JSON.stringify({ message: 'Endpoint not modeled' }));
  }
  const term = url.searchParams.get('term');
  if (term === 'Pink Floyd Rate Limit') {
    res.writeHead(429, { 'Retry-After': '60' });
    return res.end(JSON.stringify({ errorMessage: 'Too many requests' }));
  }
  const russianSongs = new Map([
    ['Король И Шут Лесник', {
      trackId: 10, trackName: 'Лесник', ruArtist: 'Король и Шут', usArtist: 'Korol I Shut',
      collectionName: 'Лучшее', trackTimeMillis: 191000,
    }],
    ['Леонид Агутин На сиреневой луне', {
      trackId: 11, trackName: 'На сиреневой луне', ruArtist: null, usArtist: 'Leonid Agutin',
      collectionName: 'Лучшие песни', trackTimeMillis: 328000,
    }],
    ['Nautilus Pompilius Скованные', {
      trackId: 12, trackName: 'Скованные одной цепью', ruArtist: 'Наутилус Помпилиус', usArtist: 'Nautilus Pompilius',
      collectionName: 'Князь тишины', trackTimeMillis: 263000,
    }],
    ['Linkin Park Numb', {
      trackId: 13, trackName: 'Numb', ruArtist: 'Linkin Park', usArtist: 'Linkin Park',
      collectionName: 'Meteora', trackTimeMillis: 188000,
    }],
    ['Backstreet Boys As Long As You Love Me', {
      trackId: 14, trackName: 'As Long As You Love Me', ruArtist: 'Backstreet Boys', usArtist: 'Backstreet Boys',
      collectionName: "Backstreet's Back", trackTimeMillis: 216000,
    }],
  ]);
  if (russianSongs.has(term)) {
    const { ruArtist, usArtist, ...song } = russianSongs.get(term);
    const artistName = url.searchParams.get('country') === 'RU' ? ruArtist : usArtist;
    const results = artistName ? [{
      wrapperType: 'track', kind: 'song', ...song, artistName,
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview/example.m4a',
      trackViewUrl: `https://music.apple.com/us/album/song/123?i=${song.trackId}`,
    }] : [];
    return res.end(JSON.stringify({ resultCount: results.length, results }));
  }
  const title = ['Money', 'Time', 'Slow Song'].find((title) => term === `Pink Floyd ${title}`);
  const results = title ? [{
    wrapperType: 'track',
    kind: 'song',
    trackId: title === 'Money' ? 1 : 2,
    artistName: 'Pink Floyd',
    trackName: title,
    collectionName: 'The Dark Side of the Moon',
    previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview/example.m4a',
    trackViewUrl: 'https://music.apple.com/us/album/the-dark-side-of-the-moon/1065973699',
  }] : [];
  const body = JSON.stringify({ resultCount: results.length, results });
  if (title === 'Slow Song') setTimeout(() => res.end(body), 750);
  else res.end(body);
}).listen(process.env.PORT);
