// App compatibility fail-open boundary
// ============================================================

function reportCompatibilityFailure(name, error) {
    if (typeof console === 'undefined' || typeof console.warn !== 'function') return;
    console.warn(`[SLF] compatibility adapter failed: ${name}`, error);
}

function runCompatibilityAdapter(name, install) {
    try {
        install();
        return true;
    } catch (error) {
        reportCompatibilityFailure(name, error);
        return false;
    }
}
