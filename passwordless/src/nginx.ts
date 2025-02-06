import { usePasswordless } from 'amazon-cognito-passwordless-auth/react';
import { useEffect, useState } from 'preact/hooks';

// @ts-ignore
const { VITE_API_BASE } = window.env as {
  VITE_API_BASE: string;
};
const { DEV, VITE_INJECTED_USER_ID } = import.meta.env;

// https://gist.github.com/Paradoxis/5f42ac638792a50fee1e82bd36450665#file-http-to-ws-js
const wsApiBase = VITE_API_BASE.replace(/(http)(s)?:\/\//, 'ws$2://');

export default function useTtydWsUrl() {
  const { tokens, tokensParsed } = usePasswordless();
  const [ttydWsUrl, setTtydWsUrl] = useState('');

  useEffect(() => {
    if (!(tokens && tokensParsed)) {
      setTtydWsUrl('');
      return;
    }
    const { sub } = tokensParsed.idToken;

    fetch(VITE_API_BASE + '/spawn', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.idToken}`,
      },
    })
      .then(res => (res.ok ? res.text() : Promise.reject(new Error(res as unknown as string))))
      .then(text => {
        const token = text.substring(text.lastIndexOf('\n', text.lastIndexOf('\n') - 1)).trim();
        setTtydWsUrl(wsApiBase + '/ttyd/ws?' + new URLSearchParams({
          user_id: DEV ? VITE_INJECTED_USER_ID || sub : sub,
          token,
        }).toString());
      })
      .catch(console.error);
  }, [tokens?.idToken, tokensParsed?.idToken.sub]);

  return ttydWsUrl;
}
