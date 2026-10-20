 export function useWxAuth() {
      return {
        isVerified: computed(() => true),
        isReady: computed(() => true),
        checkSearchAuth: () => false,
      };
    }
