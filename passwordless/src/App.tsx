import "./App.css";

import { usePasswordless } from "amazon-cognito-passwordless-auth/react";
import StepUpAuth from "./StepUpAuth";
import { useState, useRef, useEffect } from 'preact/hooks';
import type { Component } from "preact";

import 'http://localhost:9000/terminal.754c44763d540d534ad4.js';
import terminalProps from './terminal';
import useTtydWsUrl from './nginx';

interface ttyd_terminal {
  Terminal(prop: {
    wsUrl: string;
  }): JSX.Element;
}

interface MyWindow extends Window {
  ttyd_terminal: ttyd_terminal;
}

declare var window: MyWindow;

const { Terminal } = window['ttyd_terminal'];

export default function App() {
  const {
    signOut, 
    signInStatus, 
    showAuthenticatorManager,
    toggleShowAuthenticatorManager,
    tokens,
    tokensParsed,
  } = usePasswordless();
  const ttydWsUrl = useTtydWsUrl();

  const [showStepUpAuth, setShowStepUpAuth] = useState(false);
  if (showStepUpAuth && signInStatus !== "SIGNED_IN") 
    setShowStepUpAuth(false);

  return (
    <div className="app">
      <div>This YOUR app</div>
      <div>Hi there {tokensParsed?.idToken.email}</div>
      <div style={{
        wordBreak: 'break-all',
      }}>{tokens?.idToken}</div>

      {ttydWsUrl && <Terminal wsUrl={ttydWsUrl} {...terminalProps} />}

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
