"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

type LogoState = {
    chars: { char: string; id: string }[];
    duration: number;
};

const STATES: LogoState[] = [
    {
        chars: [
            { char: "a", id: "a" },
            { char: "t", id: "t" },
            { char: "h", id: "h" },
            { char: "r", id: "r" },
            { char: "d", id: "d" },
        ],
        duration: 2000,
    },
    {
        chars: [
            { char: "a", id: "a" },
            { char: "t", id: "t" },
            { char: "h", id: "h" },
            { char: "r", id: "r" },
            { char: "e", id: "e2" },
            { char: "a", id: "a2" },
            { char: "d", id: "d" },
        ],
        duration: 2000,
    },
    {
        chars: [
            { char: "a", id: "a" },
            { char: "i", id: "i" },
            { char: " ", id: "space1" },
            { char: "t", id: "t" },
            { char: "h", id: "h" },
            { char: "r", id: "r" },
            { char: "e", id: "e2" },
            { char: "a", id: "a2" },
            { char: "d", id: "d" },
        ],
        duration: 1000,
    },
    {
        chars: [
            { char: "a", id: "a" },
            { char: "g", id: "g" },
            { char: "e", id: "e" },
            { char: "n", id: "n" },
            { char: "t", id: "t2" },
            { char: " ", id: "space1" },
            { char: "t", id: "t" },
            { char: "h", id: "h" },
            { char: "r", id: "r" },
            { char: "e", id: "e2" },
            { char: "a", id: "a2" },
            { char: "d", id: "d" },
        ],
        duration: 1000,
    },
    {
        chars: [
            { char: "a", id: "a" },
            { char: "g", id: "g" },
            { char: "e", id: "e" },
            { char: "n", id: "n" },
            { char: "t", id: "t2" },
            { char: " ", id: "space1" },
            { char: "t", id: "t" },
            { char: "h", id: "h" },
            { char: "r", id: "r" },
            { char: "e", id: "e2" },
            { char: "a", id: "a2" },
            { char: "d", id: "d" },
        ],
        duration: 2000,
    },
    {
        chars: [
            { char: "a", id: "a" },
            { char: "t", id: "t" },
            { char: "h", id: "h" },
            { char: "r", id: "r" },
            { char: "d", id: "d" },
        ],
        duration: 2000,
    },
];

export function AnimatedLogo({ className }: { className?: string }) {
    const [index, setIndex] = useState(0);

    useEffect(() => {
        if (index === STATES.length - 1) return;

        const timer = setTimeout(() => {
            setIndex((prev) => prev + 1);
        }, STATES[index]!.duration);

        return () => clearTimeout(timer);
    }, [index]);

    return (
        <span
            className={cn(
                "inline-flex items-center whitespace-pre overflow-hidden h-[1.5em]",
                className
            )}
        >
            <AnimatePresence mode="popLayout" initial={false}>
                {STATES[index]!.chars.map((item) => (
                    <motion.span
                        key={item.id}
                        layoutId={item.id}
                        initial={{ opacity: 0, x: -10, filter: "blur(4px)" }}
                        animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0, x: 10, filter: "blur(4px)" }}
                        transition={{
                            type: "spring",
                            stiffness: 400,
                            damping: 30,
                            opacity: { duration: 0.2 },
                            filter: { duration: 0.2 },
                        }}
                        className="inline-block"
                    >
                        {item.char}
                    </motion.span>
                ))}
            </AnimatePresence>
        </span>
    );
}
