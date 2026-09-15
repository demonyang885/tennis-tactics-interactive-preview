# Mobile runtime components

## Carousel

`Carousel` is the standard component for horizontal collections: cards, images, media, swipeable items, and chip or filter rails. Place it directly inside `MobileScroll`; consumers should not add gesture wrappers or pointer handlers.

```tsx
<MobileScroll>
  <section>
    <Carousel
      ariaLabel="Event details"
      className="event-carousel"
      contentClassName="event-carousel-track"
    >
      {cards}
    </Carousel>
  </section>
</MobileScroll>
```

The runtime resolves nested gestures by axis. Horizontal intent stays with `Carousel`; vertical intent is handed to the parent `MobileScroll`. Slight vertical drift after a horizontal gesture is claimed does not move, rubber-band, or add momentum to the parent. Taps remain clickable, while a completed drag suppresses the item click.

Do not use `data-scroll-drag="ignore"` for carousels or ordinary rails. It is a hard opt-out that prevents parent scrolling in every direction. Do not layer CSS scroll snapping over the runtime's JavaScript momentum. If snapping is added later, it should be a component option so one system owns release motion.

## Native input surfaces

Use `KeyboardInput`, `KeyboardTextarea`, or `MobileTextField` for text entry. These are native browser fields; they track focus so shared close actions can call `keyboard.hide()` and blur the active field. They never render a simulated keyboard or add a keyboard-height inset. Let the browser's visual viewport handle the system keyboard. When an input surface closes, call `keyboard.hide()` before updating its open state.

## BottomSheet

`BottomSheet` dismisses the keyboard before opening and animates both in and out by default. Keep its `open` state controlled through `onOpenChange`; no consumer exit-animation wrapper is needed.
