
'use client';

export default function LandingPage() {
  return (
    <div className="h-screen w-screen bg-background text-foreground p-10">
      <h1 className="text-4xl text-blue-500 mb-5">Landing Page Test</h1>
      <p className="mb-2">If you see this, basic rendering is working.</p>
      <p className="mb-2">The background of this whole page should be a very light grey (from bg-background class applied via globals.css variables).</p>
      <p className="mb-2">The text color for these paragraphs should be a dark grey (from text-foreground class applied via globals.css variables).</p>
      <p className="text-green-500 mb-2">This text should be green (Tailwind direct class).</p>
      <div className="w-40 h-20 bg-primary p-2 mt-2">This box should be light blue (Tailwind custom var primary). Its text should be dark (primary-foreground).</div>
      <div className="w-40 h-20 bg-accent p-2 mt-2">This box should be teal (Tailwind custom var accent). Its text should be white (accent-foreground).</div>
    </div>
  );
}
