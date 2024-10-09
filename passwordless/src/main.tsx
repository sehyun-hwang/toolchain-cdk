/**
 * Copyright Amazon.com, Inc. and its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"). You
 * may not use this file except in compliance with the License. A copy of
 * the License is located at
 *
 *     http://aws.amazon.com/apache2.0/
 *
 * or in the "license" file accompanying this file. This file is
 * distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied. See the License for the specific
 * language governing permissions and limitations under the License.
 */
// import React from "react";
// import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { Passwordless } from "amazon-cognito-passwordless-auth";
import {
  PasswordlessContextProvider,
  Passwordless as PasswordlessComponent,
  Fido2Toast,
} from "amazon-cognito-passwordless-auth/react";
import "amazon-cognito-passwordless-auth/passwordless.css";
import "@cloudscape-design/global-styles/index.css";
import { render } from 'preact';

console.debug("App built at:", import.meta.env.VITE_APP_BUILD_DATE);

Passwordless.configure({
  cognitoIdpEndpoint: 'ap-northeast-1',
  clientId: '69v2rfdafphstpehrkrobmrkn2',
  fido2: {
    baseUrl: 'https://ygaiuupzt3.execute-api.ap-northeast-1.amazonaws.com/v1/',
    authenticatorSelection: {
      userVerification: "required",
    },
  },
  debug: console.debug,
});

render(
  <PasswordlessContextProvider enableLocalUserCache={true}>
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
  </PasswordlessContextProvider>
  , document.getElementById("root") as HTMLElement);
