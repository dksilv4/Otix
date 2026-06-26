import {Gamepad2} from "lucide-react";

const GameThumb = ({icon, alt}: { icon: string | undefined, alt: string }) => {


    const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
        (e.target as HTMLImageElement).style.display = 'none'
    }

    return <div className="w-full h-full relative">
        {
            icon ?
                (<img src={icon} alt={alt} className="absolute inset-0 w-full h-full object-cover" onError={handleError}/>) :
                (<div className="w-full h-full flex items-center justify-center bg-white/5">
                    <Gamepad2 size={14} className="opacity-30"/>
                </div>)
        }
    </div>
};
export default GameThumb;