import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import InkfishWatermark from "@/shared/components/InkfishWatermark";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted relative">
      {/* Inkfish watermark */}
      <InkfishWatermark />
      
      <span className="text-3xl font-black tracking-tight text-primary mb-6 relative z-10">STORM</span>
      <div className="text-center relative z-10">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
