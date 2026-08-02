import { useAuth } from "./hooks/useAuth";
import { Account } from "./ui/Account";
import { SignIn } from "./ui/SignIn";
import { SyncIndicator } from "./ui/SyncIndicator";

export default function App() {
  const auth = useAuth();

  return (
    <div
      className="flex h-full flex-col bg-slate-900 text-slate-100"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <span className="font-semibold">Move Ledger</span>
        {auth.status === "signedIn" ? <SyncIndicator /> : null}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {auth.status === "loading" ? (
          <div className="flex min-h-full items-center justify-center text-slate-500">Loading</div>
        ) : auth.status === "signedOut" ? (
          <SignIn />
        ) : (
          <Account user={auth.user} />
        )}
      </main>
    </div>
  );
}
