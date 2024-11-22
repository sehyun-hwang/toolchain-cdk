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

import App from "./App";
import { MockPasswordless } from "./local-cognito";

Passwordless.configure(import.meta.env.PASSWORDLESS_CONFIG_JSON);

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
