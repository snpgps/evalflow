
// This file is effectively replaced by /src/app/select-project/page.tsx
// Its content is removed to avoid confusion.
// The routing change will make /login inaccessible, and /select-project the new entry point.

export default function LoginPageRedirect() {
  // This component can be minimal or redirect if ever accessed.
  // However, with Next.js file-based routing, simply having select-project/page.tsx
  // and updating links should suffice. This file might just be deleted by the build/deploy process
  // if it's no longer part of the app's routes.
  // For safety in this environment, I'll make it return null.
  return null;
}
