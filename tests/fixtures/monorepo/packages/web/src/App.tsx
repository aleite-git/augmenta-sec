import React from 'react';
import type {ApiResponse} from '@monorepo/shared';

export function App() {
  const [data, setData] = React.useState<ApiResponse<string> | null>(null);

  React.useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setData);
  }, []);

  return <div>{data?.data ?? 'Loading...'}</div>;
}
