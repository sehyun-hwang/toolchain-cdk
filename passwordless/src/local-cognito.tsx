import { usePasswordless } from "amazon-cognito-passwordless-auth/react";
import { authenticateWithPlaintextPassword } from "amazon-cognito-passwordless-auth/plaintext";
import { useEffect } from 'preact/hooks'
import type { User, UserPool } from "cognito-local/lib/services/userPoolService"

const cognitoLocalDbUrl = '/' + import.meta.env.COGNITO_LOCAL_DB_JSON;
console.log({ cognitoLocalDbUrl });

const fetchMockCredential = () => fetch(cognitoLocalDbUrl)
  .then(res => res.json() as Promise<{
    Users: Record<string, User>,
    Options: UserPool,
  }>)
  .then(({ Users, Options }) => {
    console.log('Cognito local db', Users, Options);
    const [{ 
      Username: username,
      Password: password,
    }] = Object.values(Users);
    return { username, password };
  });

export function MockPasswordless() {
  const { authenticateWithPlaintextPassword, signInStatus } = usePasswordless();

  useEffect(() => {
    signInStatus === 'NOT_SIGNED_IN' && fetchMockCredential()
      .then(credential => authenticateWithPlaintextPassword(credential));
  }, [signInStatus]);

  return <></>
}

