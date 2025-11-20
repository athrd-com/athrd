"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export default function PricingPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="container mx-auto py-24 px-4">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl mb-4">
          Simple, transparent pricing
        </h1>
        <p className="text-lg text-gray-400">
          Choose the plan that works best for you and your team.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
        {/* Free Tier */}
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-2xl text-white">Free</CardTitle>
            <CardDescription className="text-gray-400">
              For everyone. No restrictions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 flex-1">
            <div className="text-4xl font-bold text-white">
              $0
              <span className="text-lg font-normal text-gray-400">/month</span>
            </div>
            <ul className="space-y-2 pt-4">
              <li className="flex items-center text-gray-300">
                <Check className="h-5 w-5 text-green-500 mr-2" />
                Unlimited threads
              </li>
              <li className="flex items-center text-gray-300">
                <Check className="h-5 w-5 text-green-500 mr-2" />
                Private by default (unlisted)
              </li>
              <li className="flex items-center text-gray-300">
                <Check className="h-5 w-5 text-green-500 mr-2" />
                Share via link
              </li>
            </ul>
          </CardContent>
          <CardFooter>
            <Link href="/" className="w-full">
              <Button className="w-full" variant="outline">
                Get Started
              </Button>
            </Link>
          </CardFooter>
        </Card>

        {/* Enterprise Tier */}
        <Card className="bg-zinc-900/50 border-zinc-800 relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-blue-600 text-white text-xs px-3 py-1 rounded-bl-lg">
            Enterprise
          </div>
          <CardHeader>
            <CardTitle className="text-2xl text-white">Enterprise</CardTitle>
            <CardDescription className="text-gray-400">
              For organizations requiring strict access control
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 flex-1">
            <div className="text-4xl font-bold text-white">Custom</div>
            <ul className="space-y-2 pt-4">
              <li className="flex items-center text-gray-300">
                <Check className="h-5 w-5 text-blue-500 mr-2" />
                Everything in Free
              </li>
              <li className="flex items-center text-gray-300">
                <Check className="h-5 w-5 text-blue-500 mr-2" />
                GitHub Organization integration
              </li>
              <li className="flex items-center text-gray-300">
                <Check className="h-5 w-5 text-blue-500 mr-2" />
                Restrict access to organization members
              </li>
              <li className="flex items-center text-gray-300">
                <Check className="h-5 w-5 text-blue-500 mr-2" />
                Priority support
              </li>
            </ul>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => setIsModalOpen(true)}
            >
              Contact Us
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-md w-full shadow-2xl relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              ✕
            </button>
            <h2 className="text-2xl font-bold text-white mb-4">
              Contact Sales
            </h2>
            <p className="text-gray-300 mb-6">
              Please send us an email at{" "}
              <a
                href="mailto:founder@athrd.com"
                className="text-blue-400 hover:underline"
              >
                founder@athrd.com
              </a>{" "}
              with your:
            </p>
            <ul className="list-disc list-inside text-gray-300 mb-6 space-y-2">
              <li>Company Name</li>
              <li>Company Size</li>
            </ul>
            <div className="flex justify-end">
              <Button onClick={() => setIsModalOpen(false)} variant="secondary">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
