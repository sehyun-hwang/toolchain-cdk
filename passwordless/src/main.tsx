import "amazon-cognito-passwordless-auth/passwordless.css";
import "@cloudscape-design/global-styles/index.css";
import "./index.css";

import { render } from 'preact';
import { Passwordless } from "amazon-cognito-passwordless-auth";
import {
  PasswordlessContextProvider,
  Passwordless as PasswordlessComponent,
  Fido2Toast,
} from "amazon-cognito-passwordless-auth/react";
import type { Config } from "amazon-cognito-passwordless-auth/config";

import App from "./App";
import { MockPasswordless } from "./local-cognito";

const { env } = window as unknown as {
  env: {
    VITE_API_BASE: string;
    PASSWORDLESS_CONFIG: string[] | Config;
  }
};
console.log(env);

function unflattenObject(flatObject: any) {
  const result = {};

  for (const key in flatObject) {
    if (flatObject.hasOwnProperty(key)) {
      const path = key.split('.');
      let current = result;

      for (let i = 0; i < path.length - 1; i++) {
        const part = path[i];
        // @ts-ignore
        if (!current[part]) {
          // @ts-ignore
          current[part] = /^\d+$/.test(part) ? [] : {};
        }
        // @ts-ignore
        current = current[part];
      }

      const lastPart = path[path.length - 1];
      // @ts-ignore
      current[lastPart] = flatObject[key];
    }
  }

  return result;
}

// @ts-ignore
if (Array.isArray(env.PASSWORDLESS_CONFIG)) {
  const chunkSize = 2;
  const entries = env.PASSWORDLESS_CONFIG.reduce((acc, _, i) => {
    if (i % chunkSize === 0) 
      // @ts-ignore
      acc.push(env.PASSWORDLESS_CONFIG.slice(i, i + chunkSize));
    return acc;
  }, []);
  const config = unflattenObject(Object.fromEntries(entries)) as Config
  console.log(config)
  Passwordless.configure(config);
} else
  Passwordless.configure(env.PASSWORDLESS_CONFIG);

render(
  <PasswordlessContextProvider enableLocalUserCache={true}>
    {import.meta.env.DEV && <MockPasswordless />}  

    <PasswordlessComponent
      brand={{
        backgroundImageUrl:
          "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Manhattan_in_the_distance_%28Unsplash%29.jpg/2880px-Manhattan_in_the_distance_%28Unsplash%29.jpg",
        customerName: "Amazon Web Services",
        customerLogoUrl:
          "https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Amazon_Web_Services_Logo.svg/1280px-Amazon_Web_Services_Logo.svg.png",
      }}
    >
      {/*<React.StrictMode>*/}
      <App />
      {/*</React.StrictMode>*/}
    </PasswordlessComponent>
    <Fido2Toast /> {/* Add Fido2Toast below App so it is rendered on top */}
  </PasswordlessContextProvider >
  , document.getElementById("root") as HTMLElement);
