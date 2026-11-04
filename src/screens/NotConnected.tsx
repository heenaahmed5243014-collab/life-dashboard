export default function NotConnected() {
  return (
    <main className="page signin">
      <header className="page-head">
        <h1 className="h1">Almost there</h1>
        <p className="muted">The app isn’t connected to its database yet. Add the two Supabase settings in Vercel, then redeploy.</p>
      </header>
      <a className="link-btn" href="?demo">Try the demo instead</a>
    </main>
  );
}
