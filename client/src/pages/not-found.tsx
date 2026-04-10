import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
      <div className="text-4xl mb-4">🗺️</div>
      <h1 className="text-xl font-bold mb-2">Sida hittades inte</h1>
      <p className="text-muted-foreground text-sm mb-6">Den här sidan existerar inte.</p>
      <Link href="/">
        <a className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
          Gå till översikten
        </a>
      </Link>
    </div>
  );
}
