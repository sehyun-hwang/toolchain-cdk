const idToken = 'eyJraWQiOiJDZER3dlpNQnlLYWZLUjlIdUhHQUJ6dXNrdW9LNFRqdWpCXC9kZ3NcL2V2RG89IiwiYWxnIjoiUlMyNTYifQ.eyJzdWIiOiIyN2M0ZGE0OC1kMGUxLTcwNGQtNjViYi03ZmY5YzM0OTIyODQiLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiaXNzIjoiaHR0cHM6XC9cL2NvZ25pdG8taWRwLmFwLW5vcnRoZWFzdC0xLmFtYXpvbmF3cy5jb21cL2FwLW5vcnRoZWFzdC0xX3NMdGJ6b2VCOCIsImNvZ25pdG86dXNlcm5hbWUiOiIyN2M0ZGE0OC1kMGUxLTcwNGQtNjViYi03ZmY5YzM0OTIyODQiLCJvcmlnaW5fanRpIjoiOWZmMjkxYjYtNjMyMi00MThlLWFiY2ItYWM4Yjg1ODExMmE2IiwiYXVkIjoiM2MzN29iN3Zwc2sycDNvZmRhaGpyY3IxdmoiLCJldmVudF9pZCI6IjA1YTMzMGFjLWIxZDktNDljOC1hZTU3LWY0OGY4YWE4MWVlZSIsInRva2VuX3VzZSI6ImlkIiwiYXV0aF90aW1lIjoxNzMxNTY4ODk1LCJleHAiOjE3MzE1NzA2NzcsImlhdCI6MTczMTU3MDM3NywianRpIjoiYzVkYzkxODEtOTcxOS00Y2QwLTlhY2YtYjEyNjczM2IwZmUwIiwiZW1haWwiOiJod2FuZ2h5dW4zK0QwN0hEVEM1VVFMQGdtYWlsLmNvbSJ9.arDTOy8bFXQUozX6kdy-57lEFz0omg7N6UI_LqG317Nt6bMIRCgtoMD139bGPlQJ1XMMbI8QwtbzmqG3tIha0X4xRUDggFjH4UvtZItFhOwlxQv2b5DTMWQO36FIJWjaKwiYVPMt4O5s-EtvbpTcdPFlEM9nTqIdznCWYH1JGXPucZv-im9CylDaUsi0ZfydKYX2Ij5Gx4dnnWEC4uxqEjbP2nO9bFZUQDAT5AEsNL7zt6GDECT8zj0OpSdvN-bfzxoySjeqLbUJWGn0Az5t5W8kuxgTLNC-WJHHPj337ZssBlN5u4-dGrWD011yFe7i2admjFdd5KypuqEUlegUTg';

const { API_HOST, DEV, INJECTED_USER_ID } = import.meta.env as ImportMetaEnv & {
  API_HOST: string;
};

export async function generateTtydWsUrl(idToken: string, userId: string) {
  const text = await fetch('http://localhost:8889/spawn', 
    headers: {
    Authorization: 'Bearer ' + idToken,
  },
  ).then(res => {
    console.log(res.headers);
    return res.text();
  });
  console.log(text);
  const token = text.substring(text.lastIndexOf('\n', text.lastIndexOf('\n') - 1)).trim();
  console.log(token);

  const spawn = () => fetch('ws://localhost:8889/ttyd/?' + new URLSearchParams({
    user_id: DEV ? 'mock-cognito-identity-id' ,
    token,
  }))
    .then(res => res.text())
    .then(text => { console.log(text.substring(0, 100)); })
    .then(() => setTimeout(spawn, 1000));

}