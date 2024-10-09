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
import "./App.css";
import "xterm/css/xterm.css";

import { usePasswordless } from "amazon-cognito-passwordless-auth/react";
import StepUpAuth from "./StepUpAuth";
// import { useState, useRef, useEffect } from "react";
import { useState, useRef, useEffect } from 'preact/hooks';

import terminalProps from './terminal';

const { Terminal } = window.ttyd_terminal;

function App() {
  const {
    signOut,
    signInStatus,
    showAuthenticatorManager,
    toggleShowAuthenticatorManager,
    tokensParsed,
  } = usePasswordless();

  const [showStepUpAuth, setShowStepUpAuth] = useState(false);
  if (showStepUpAuth && signInStatus !== "SIGNED_IN") setShowStepUpAuth(false);

  return (
    <div className="app">
      <div>This YOUR app</div>
      <div>Hi there {tokensParsed?.idToken.email}</div>

      <Terminal {...terminalProps} />

      <button
        onClick={() => {
          signOut();
        }}
      >
        Sign out
      </button>
      <button
        onClick={() => toggleShowAuthenticatorManager()}
        disabled={showAuthenticatorManager}
      >
        Manage authenticators
      </button>
      {showStepUpAuth ? (
        <StepUpAuth />
      ) : (
        <button onClick={() => setShowStepUpAuth(true)}>
          Show Step Up Auth
        </button>
      )}
    </div>
  );
}

export default App;
