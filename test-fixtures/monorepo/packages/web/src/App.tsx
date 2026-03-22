import React from 'react';
import {BrowserRouter, Routes, Route} from 'react-router-dom';

function Home(): React.ReactElement {
  return (
    <main>
      <h1>Acme Dashboard</h1>
      <p>Welcome to the Acme monorepo web application.</p>
    </main>
  );
}

function App(): React.ReactElement {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
