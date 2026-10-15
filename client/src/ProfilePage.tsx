import { useAuth } from "./auth";

export default function ProfilePage() {
  const { user } = useAuth();
  if (!user) return null; // RequireAuth in App.tsx keeps logged-out visitors from getting here

  return (
    <div>
      <h2>Your profile</h2>
      <p>
        <strong>Name:</strong> {user.display_name}
      </p>
      <p>
        <strong>Email:</strong> {user.email}
      </p>
      <p>
        <strong>Token balance:</strong> {user.tokens}
      </p>
      <p>
        <strong>Trophies:</strong> {user.trophies} (best: {user.best_trophies})
      </p>
      <p style={{ color: "#555" }}>
        This information is saved in the database. Log out and back in and it will still be here.
      </p>
    </div>
  );
}