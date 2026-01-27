import PlushMenu from "./PlushMenu";
import PlushGrid from "./PlushGrid";
import PlushCart from "./PlushCart";

function App() {
  return (
    <div className="catalog-root">
      <PlushMenu />
      <main className="catalog-main">
        <PlushGrid />
      </main>
      <PlushCart />
    </div>
  );
}

export default App;
