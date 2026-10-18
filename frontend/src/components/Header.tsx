import { Link } from "react-router-dom";
import { site } from "../config/site";
import { useAuth } from "../hooks/useAuth";
import { Avatar } from "./Avatar";
import { Button } from "./ui/Button";

export function Header() {
  const { user, logout } = useAuth();
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to={user ? "/dashboard" : "/"} className="text-lg font-semibold tracking-tight">
          {site.product}
        </Link>
        {user && (
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">{user.name}</p>
              <p className="text-xs leading-tight text-muted">{user.email}</p>
            </div>
            <Avatar user={user} />
            <Button variant="secondary" onClick={() => void logout()}>
              Log out
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
