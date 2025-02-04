import React, { useEffect, useRef } from 'react';
import { Swapy, createSwapy } from 'swapy';

const SwapyCircles = () => {
  const swapyRef = useRef<Swapy | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      swapyRef.current = createSwapy(containerRef.current, {
        // animation: 'dynamic'
        // swapMode: 'drop',
        // autoScrollOnDrag: true,
        // enabled: true,
        // dragAxis: 'x',
        // dragOnHold: true
      })

      // swapyRef.current.enable(false)
      // swapyRef.current.destroy()
      // console.log(swapyRef.current.slotItemMap())

      swapyRef.current.onBeforeSwap((event) => {
        console.log('beforeSwap', event)
        // This is for dynamically enabling and disabling swapping.
        // Return true to allow swapping, and return false to prevent swapping.
        return true
      })

      swapyRef.current.onSwapStart((event) => {
        console.log('start', event);
      })
      swapyRef.current.onSwap((event) => {
        console.log('swap', event);
      })
      swapyRef.current.onSwapEnd((event) => {
        console.log('end', event);
      })
    }
    return () => {
      swapyRef.current?.destroy()
    }
  }, [])
  return (
    <div className="container" ref={containerRef}>
      <div data-swapy-slot="a">
        <div data-swapy-item="a">
          <div className='text-blue-500'>A</div>
        </div>
      </div>
      <div data-swapy-slot="b">
        <div data-swapy-item="b">
          <div className='text-blue-500'>B</div>
        </div>
      </div>
      <div data-swapy-slot="c">
        <div data-swapy-item="c">
          <div className='text-blue-500'>C</div>
        </div>
      </div>
    </div>
  )
}

export default SwapyCircles;
