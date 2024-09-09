import test from 'node:test';

test('Test bastion nginx', async () => {
  const user_id = 'user';
  const text = await fetch('http://localhost:8888/spawn', {
    headers: {
      'X-User-Id': user_id,
    },
  }).then(res => {
    console.log(res.headers);
    return res.text();
  });
  console.log(text);
  const token = text.substring(text.lastIndexOf('\n', text.lastIndexOf('\n') - 1)).trim();
  console.log(token);

  const spawn = () => fetch('http://localhost:8888/ttyd/?' + new URLSearchParams({
    user_id,
    token,
  }))
    .then(res => res.text())
    .then(text => console.log(text.substring(0, 100)))
    .then(() => setTimeout(spawn, 1000));

  spawn();
});
