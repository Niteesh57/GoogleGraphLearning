/**
 * Utility for detecting if the user is on a mobile device.
 * Used for adjusting UI layouts and managing session data.
 */
export const isMobileDevice = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};
