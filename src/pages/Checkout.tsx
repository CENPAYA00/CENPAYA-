const confirm = async () => {
  setErr('');
  if (!item) return setErr('Item not found.');
  
  // Wallet payment (existing logic)
  if (method === 'wallet') {
    if (walletFunds < total) {
      return setErr(`Insufficient wallet balance. You need ${total.toLocaleString()} XAF. Top up first.`);
    }
    
    setProcessing(true);
    try {
      if (item._kind === 'service') {
        const { data, error } = await supabase.rpc('create_service_order', {
          p_service_id: item.id,
          p_package_id: packageId,
          p_requirements: requirements.trim() || null,
          p_pay_from_wallet: true,
        });
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || 'Order failed');
        navigate(`/service-order/${data.order_id}`);
      } else {
        // Listing wallet payment logic...
        const payload = {
          buyer_id: me?.id,
          seller_id: item.seller_id,
          listing_id: item.id,
          amount: total,
          payment_method: 'wallet',
        };
        const { data, error } = await supabase.from('orders').insert(payload).select().single();
        if (error) throw error;
        navigate(`/order/${data.id}`);
      }
    } catch (e: any) {
      setErr(e.message || 'Payment failed');
    } finally {
      setProcessing(false);
    }
    return;
  }

  // MoMo payment (NEW LOGIC)
  if (method === 'momo') {
    if (!payPhone.trim()) return setErr('Enter your Mobile Money number.');
    if (item._kind !== 'service') return setErr('MoMo payments are currently only for services.');

    setProcessing(true);
    try {
      const me = await getCachedUser();
      if (!me) throw new Error("Not logged in");

      // Call the new 'initiate-payment' function
      const { data, error } = await supabase.functions.invoke('initiate-payment', {
        body: {
          service_id: item.id,
          package_id: packageId,
          buyer_id: me.id,
          requirements: requirements.trim() || '—',
          method: 'mtn_momo', // or dynamic based on your UI
        }
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Payment initiation failed');

      // Redirect user to the MoMo checkout page (Fapshi/Campay)
      if (data.payment_url) {
        window.location.href = data.payment_url;
      } else {
        throw new Error("No payment URL returned");
      }
    } catch (e: any) {
      setErr(e.message || 'Payment failed');
      setProcessing(false);
    }
  }
};
