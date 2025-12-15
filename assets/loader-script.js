const injectTime = performance.now();

async function loadAndExecuteModule() {
    try {
        const { onExecute } = await import(
            chrome.runtime.getURL("assets/index.ts-8f4093df.js")
        );
        onExecute?.({ perf: { injectTime, loadTime: performance.now() - injectTime } });
    } catch (error) {
        console.warn('Failed to load module:', error);
    }
}

loadAndExecuteModule();

export {
    loadAndExecuteModule
};
