import { Clock } from "lucide-react";

const Logo = ({ size = "md" }: { size?: "sm" | "md" | "lg" }) => {
  const sizes = { sm: "h-5 w-5", md: "h-6 w-6", lg: "h-10 w-10" };
  const textSizes = { sm: "text-sm", md: "text-lg", lg: "text-2xl" };
  
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <Clock className={`${sizes[size]} text-sidebar-primary`} strokeWidth={2.5} />
      </div>
      <span className={`${textSizes[size]} font-bold tracking-tight`}>
        Aponta<span className="text-sidebar-primary">Mentto</span>
      </span>
    </div>
  );
};

export default Logo;
