import { AppProviders } from "./app/providers";
import { AppRoutes } from "./app/routes";
import { useAppBootstrap } from "./app/use-app-bootstrap";
import { usePageViewTracking } from "./app/use-page-view";

function App() {
  const { config, profile } = useAppBootstrap();
  usePageViewTracking();

  return (
    <AppProviders config={config} profile={profile}>
      <AppRoutes />
    </AppProviders>
  )
}

export default App
