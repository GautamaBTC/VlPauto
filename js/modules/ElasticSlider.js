import { animate, motionValue, transform } from "motion";

const MAX_OVERFLOW = 50;

function decay(value, max) {
    if (max === 0) return 0;
    const entry = value / max;
    const sigmoid = 2 * (1 / (1 + Math.exp(-entry)) - 0.5);
    return sigmoid * max;
}

export function createElasticSlider(container, options) {
    const {
        defaultValue = 50,
        startingValue = 0,
        maxValue = 100,
        isStepped = false,
        stepSize = 1,
        leftIconHTML = '₽',
        rightIconHTML = '₽',
        onValueChange = () => {}
    } = options;

    let currentValue = defaultValue;

    // --- Create DOM Elements ---
    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'slider-container';

    const sliderWrapper = document.createElement('div');
    sliderWrapper.className = 'slider-wrapper';

    const leftIcon = document.createElement('div');
    leftIcon.innerHTML = leftIconHTML;
    leftIcon.className = 'icon';

    const rightIcon = document.createElement('div');
    rightIcon.innerHTML = rightIconHTML;
    rightIcon.className = 'icon';

    const sliderRoot = document.createElement('div');
    sliderRoot.className = 'slider-root';

    const sliderTrackWrapper = document.createElement('div');
    sliderTrackWrapper.className = 'slider-track-wrapper';

    const sliderTrack = document.createElement('div');
    sliderTrack.className = 'slider-track';

    const sliderRange = document.createElement('div');
    sliderRange.className = 'slider-range';

    const valueIndicator = document.createElement('p');
    valueIndicator.className = 'value-indicator';

    sliderTrack.appendChild(sliderRange);
    sliderTrackWrapper.appendChild(sliderTrack);
    sliderRoot.appendChild(sliderTrackWrapper);
    sliderWrapper.append(leftIcon, sliderRoot, rightIcon);
    sliderContainer.append(sliderWrapper, valueIndicator);
    container.appendChild(sliderContainer);

    // --- Motion Values ---
    const clientX = motionValue(0);
    const overflow = motionValue(0);
    const scale = motionValue(1);
    let region = "middle";

    // --- Update Functions ---
    function updateValueIndicator() {
        valueIndicator.textContent = `${Math.round(currentValue)}%`;
    }

    function updateRangePercentage() {
        const totalRange = maxValue - startingValue;
        if (totalRange === 0) return;
        const percentage = ((currentValue - startingValue) / totalRange) * 100;
        sliderRange.style.width = `${percentage}%`;
    }

    updateValueIndicator();
    updateRangePercentage();

    // --- Event Listeners and Animations ---
    clientX.on("change", (latest) => {
        const { left, right } = sliderRoot.getBoundingClientRect();
        let newOverflow;
        if (latest < left) {
            region = "left";
            newOverflow = left - latest;
        } else if (latest > right) {
            region = "right";
            newOverflow = latest - right;
        } else {
            region = "middle";
            newOverflow = 0;
        }
        overflow.set(decay(newOverflow, MAX_OVERFLOW));
    });

    const handlePointerMove = (e) => {
        if (e.buttons > 0) {
            const { left, width } = sliderRoot.getBoundingClientRect();
            let newValue = startingValue + ((e.clientX - left) / width) * (maxValue - startingValue);

            if (isStepped) {
                newValue = Math.round(newValue / stepSize) * stepSize;
            }

            newValue = Math.min(Math.max(newValue, startingValue), maxValue);

            if (currentValue !== newValue) {
                currentValue = newValue;
                updateValueIndicator();
                updateRangePercentage();
                onValueChange(currentValue);
            }
            clientX.set(e.clientX);
        }
    };

    const handlePointerDown = (e) => {
        handlePointerMove(e);
        sliderRoot.setPointerCapture(e.pointerId);
    };

    const handlePointerUp = () => {
        animate(overflow, 0, { type: "spring", bounce: 0.5 });
        sliderRoot.releasePointerCapture(event.pointerId);
    };

    sliderRoot.addEventListener('pointerdown', handlePointerDown);
    sliderRoot.addEventListener('pointermove', handlePointerMove);
    sliderRoot.addEventListener('pointerup', handlePointerUp);

    // --- Animations ---
    sliderWrapper.addEventListener('mouseenter', () => animate(scale, 1.2));
    sliderWrapper.addEventListener('mouseleave', () => animate(scale, 1));
    sliderWrapper.addEventListener('touchstart', () => animate(scale, 1.2), { passive: true });
    sliderWrapper.addEventListener('touchend', () => animate(scale, 1));

    // Animate scale and opacity of the whole wrapper
    scale.on("change", v => sliderWrapper.style.opacity = transform(v, [1, 1.2], [0.7, 1]));

    // Animate icon scaling
    overflow.on("change", v => {
        if (region === 'left') {
            const iconScale = transform(v, [0, MAX_OVERFLOW], [1, 1.4]);
            leftIcon.style.transform = `scale(${iconScale})`;
            rightIcon.style.transform = `scale(1)`;
        } else if (region === 'right') {
            const iconScale = transform(v, [0, MAX_OVERFLOW], [1, 1.4]);
            rightIcon.style.transform = `scale(${iconScale})`;
            leftIcon.style.transform = `scale(1)`;
        } else {
            leftIcon.style.transform = `scale(1)`;
            rightIcon.style.transform = `scale(1)`;
        }
    });

    // Animate track wrapper scaling and height
    overflow.on("change", v => {
        const { width } = sliderRoot.getBoundingClientRect();
        if (width === 0) return;

        const scaleX = 1 + v / width;
        const scaleY = transform(v, [0, MAX_OVERFLOW], [1, 0.8]);
        const origin = clientX.get() < sliderRoot.getBoundingClientRect().left + width / 2 ? "right" : "left";

        sliderTrackWrapper.style.transform = `scaleX(${scaleX}) scaleY(${scaleY})`;
        sliderTrackWrapper.style.transformOrigin = origin;
    });

    scale.on("change", v => {
        const height = transform(v, [1, 1.2], [6, 12]);
        const margin = transform(v, [1, 1.2], [0, -3]);
        sliderTrackWrapper.style.height = `${height}px`;
        sliderTrackWrapper.style.marginTop = `${margin}px`;
        sliderTrackWrapper.style.marginBottom = `${margin}px`;
    });

    // Return a function to update the value externally if needed
    return {
        setValue: (newValue) => {
            currentValue = Math.min(Math.max(newValue, startingValue), maxValue);
            updateValueIndicator();
            updateRangePercentage();
        }
    };
}
