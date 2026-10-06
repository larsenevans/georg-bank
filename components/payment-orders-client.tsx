'use client'

import { ChevronDown, ChevronUp, Globe, HelpCircle } from 'lucide-react'

export function PaymentOrdersClient() {
  return (
    <div className="flex-1 flex flex-col bg-[#111216] font-sans text-white select-none">
      {/* Sub Header */}
      <div className="bg-[#5b2d5c] py-3.5 text-center flex items-center justify-center gap-1.5 cursor-pointer border-t border-white/10">
        <h2 className="text-[15px] font-bold text-white tracking-wide">Platobné príkazy</h2>
        <ChevronDown className="w-4 h-4 text-white opacity-80" />
      </div>

      <main className="flex-1 w-full max-w-md mx-auto px-4 py-5 flex flex-col gap-4">
        
        {/* Select Dropdown */}
        <div className="relative">
          <select className="w-full appearance-none bg-transparent border border-[#424455] text-white text-[15px] rounded-[10px] pl-4 pr-10 py-3.5 focus:outline-none">
            <option className="bg-[#22222b] text-white">Počet vybraných produktov: 2</option>
          </select>
          <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
            <ChevronDown className="w-4 h-4 text-[#1d63ed]" />
          </div>
        </div>

        {/* List Container */}
        <div className="bg-[#22222b] rounded-xl flex flex-col overflow-hidden">
          
          {/* List Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#313342]/60">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-[15px]">1</span>
              <div className="bg-white px-1.5 py-0.5 rounded-sm">
                <span className="text-[#e54545] text-sm font-medium">Zrealizovane pohyby</span>
              </div>
            </div>
            <button className="w-8 h-8 rounded-full border-2 border-[#1d63ed] flex items-center justify-center">
              <ChevronUp className="w-4 h-4 text-[#1d63ed]" strokeWidth={2.5} />
            </button>
          </div>

          {/* Transaction Item */}
          <div className="flex px-4 py-4 relative border-l-4 border-[#7a2b82]">
            {/* Left Icon */}
            <div className="w-10 h-10 rounded-full bg-[#182a3d] flex items-center justify-center shrink-0 mt-0.5">
              <Globe className="w-5 h-5 text-[#1d63ed]" strokeWidth={1.5} />
            </div>

            {/* Content */}
            <div className="ml-3 flex-1 flex flex-col justify-center">
              <div className="flex items-start justify-between w-full">
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="text-white font-bold text-[15px] leading-tight">Business účet L</span>
                    <HelpCircle className="w-3.5 h-3.5 text-[#8e9bb5]" strokeWidth={2} />
                  </div>
                  <span className="text-[#e0e4f0] text-[13px] mt-0.5">21. jún</span>
                </div>
                <div className="text-[#e54545] font-bold text-[15px]">
                  – € 0,01
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap items-center gap-2 mt-2.5">
                <span className="bg-[#1d63ed]/15 text-[#1d63ed] text-[11px] font-semibold px-2 py-1 rounded">
                  Okamžitá platba
                </span>
                <span className="bg-[#3a1a1e] text-[#e55054] text-[11px] font-semibold px-2 py-1 rounded">
                  Nezrealizované
                </span>
              </div>
            </div>
          </div>

        </div>

      </main>

    </div>
  )
}
